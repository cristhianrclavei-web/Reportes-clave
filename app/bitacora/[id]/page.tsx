import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ActividadDetail from './ActividadDetail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ActividadPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: actividad, error } = await supabase.from('actividades').select('*').eq('id', params.id).single();
  if (error || !actividad) notFound();

  return <ActividadDetail actividadInicial={actividad as any} />;
}
