import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import RevisarPropuesta from '@/components/propuestas/RevisarPropuesta';

export const dynamic = 'force-dynamic';

// Revisar y fusionar los cambios que propuso un técnico (solo supervisión).
export default async function RevisionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/revisiones/${id}`);
  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/lazos');
  return <RevisarPropuesta propuestaId={id} />;
}
