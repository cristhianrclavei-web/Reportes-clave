import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import CotizacionDetalle from './CotizacionDetalle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CotizacionDetallePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');

  const { data: myProfile } = await supabase.from('profiles').select('full_name, can_approve_cotizacion').eq('id', user.id).single();

  const [{ data: cotizacion, error: e1 }, { data: lineas }] = await Promise.all([
    supabase.from('cotizaciones').select('*, profiles!cotizaciones_created_by_profiles_fkey(full_name)').eq('id', params.id).single(),
    supabase.from('cotizacion_lineas').select('*').eq('cotizacion_id', params.id).order('orden'),
  ]);

  if (e1 || !cotizacion) notFound();

  return (
    <CotizacionDetalle
      cotizacionInicial={cotizacion as any}
      lineasIniciales={(lineas as any) || []}
      userName={myProfile?.full_name || user.email || ''}
      correoUsuario={user.email || ''}
      puedeAprobar={Boolean(myProfile?.can_approve_cotizacion)}
    />
  );
}
