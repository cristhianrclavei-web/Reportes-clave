import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import PanelDetalle from './PanelDetalle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Un panel de un cliente: el frente con sus salidas (SLC, NAC, voceo) y el
// diagrama de todos sus circuitos. Los datos se cargan en el teléfono para
// poder verlo con la copia local si se va la señal.
export default async function PanelPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/lazos/panel/${params.id}`);

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor' && role !== 'tecnico') redirect('/login');

  return <PanelDetalle panelId={params.id} esSupervisor={role === 'supervisor'} />;
}
