import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import LazosList from '@/app/lazos/LazosList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// «Diagramas y planos» dentro del panel del supervisor: la misma lista que
// ven los técnicos en /lazos (paneles, circuitos y planos por cliente).
// `?cliente=<id>` la abre filtrada por un cliente.
export default async function DiagramasPage(props: { searchParams: Promise<{ cliente?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/diagramas');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/lazos');

  const { data: perfil } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return <LazosList userName={perfil?.full_name || user.email || ''} esSupervisor clienteInicial={searchParams.cliente || null} />;
}
