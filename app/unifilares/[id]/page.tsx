import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import EditorUnifilar from '@/components/unifilar/EditorUnifilar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Editor de un diagrama unifilar fotovoltaico.
export default async function UnifilarPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/unifilares/${id}`);

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor' && role !== 'tecnico') redirect('/login');

  // El técnico lo abre en copia: propone cambios que supervisión fusiona.
  return <EditorUnifilar unifilarId={id} esSupervisor={role === 'supervisor'} />;
}
