import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import LazoDetalle from './LazoDetalle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Un lazo: su lista en orden, el diagrama unifilar y la búsqueda de falla a
// tierra. Los datos se cargan en el teléfono (LazoDetalle) para poder seguir
// trabajando con la copia local si se va la señal.
export default async function LazoPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/lazos/${params.id}`);

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor' && role !== 'tecnico') redirect('/login');

  return <LazoDetalle lazoId={params.id} esSupervisor={role === 'supervisor'} />;
}
