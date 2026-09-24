import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ProyectosList from './ProyectosList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProyectosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: proyectos, error } = await supabase
    .from('proyectos')
    .select('*, clientes(nombre)')
    .order('updated_at', { ascending: false });

  const lista = ((proyectos as any[]) || []).map((p) => {
    const { clientes, ...resto } = p;
    return { ...resto, cliente_nombre: clientes?.nombre || '—' };
  });

  return (
    <ProyectosList
      proyectos={lista}
      userName={myProfile?.full_name || user.email || ''}
      errorCarga={error?.message || null}
    />
  );
}
