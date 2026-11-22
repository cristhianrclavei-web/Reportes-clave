import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ClientesList from './ClientesList';
import TableroProyectos from '@/components/proyectos/TableroProyectos';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Sección Proyectos: Clientes (por omisión), el tablero de todos los
// proyectos y, como subsección, Diagramas y planos.
export default async function ProyectosPage(props: { searchParams: Promise<{ sub?: string }> }) {
  const { sub } = await props.searchParams;
  if (sub === 'diagramas') redirect('/dashboard/diagramas');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  const nombre = myProfile?.full_name || user.email || '';

  if (sub === 'tablero') return <TableroProyectos userName={nombre} />;
  return <ClientesList userName={nombre} />;
}
