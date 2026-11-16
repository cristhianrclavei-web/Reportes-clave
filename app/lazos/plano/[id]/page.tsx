import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import EditorPlano from './EditorPlano';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Un plano del cliente: sembrado de equipos y trazo de la canalización.
export default async function PlanoPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ lazo?: string; elemento?: string }> }) {
  const params = await props.params;
  // ?lazo=…&elemento=…: se llega desde el diagrama del lazo para editar en el plano.
  const { lazo, elemento } = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/lazos/plano/${params.id}`);

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor' && role !== 'tecnico') redirect('/login');

  // key: al cambiar de plano el editor arranca limpio (sin el deshacer del otro).
  return <EditorPlano key={params.id} planoId={params.id} esSupervisor={role === 'supervisor'}
    inicio={lazo ? { lazoId: lazo, elementoId: elemento || null } : undefined} />;
}
