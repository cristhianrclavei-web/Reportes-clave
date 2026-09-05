import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ServicioTecnicoDetail from './ServicioTecnicoDetail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ServicioTecnicoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: servicio, error } = await supabase.from('servicios_programados').select('*').eq('id', params.id).single();
  if (error || !servicio) notFound();

  return <ServicioTecnicoDetail servicioId={params.id} />;
}
