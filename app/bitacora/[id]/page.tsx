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

  // La RLS de `actividades` ya garantiza que solo llega aquí el dueño o un
  // supervisor (lectura). Si no es el dueño, es supervisor: vista de solo
  // lectura, sin los botones de acción del técnico.
  const soloLectura = actividad.created_by !== user.id;

  return <ActividadDetail actividadInicial={actividad as any} soloLectura={soloLectura} />;
}
