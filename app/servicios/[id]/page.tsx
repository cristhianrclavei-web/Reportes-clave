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

  // Defensa en profundidad: la política de supervisor sobre esta tabla es de
  // lectura Y escritura completa (a diferencia de la bitácora, que es solo
  // lectura), así que si un supervisor llega aquí por error a la vista del
  // técnico, tocar "Marcar llegada" o "Concluir" SÍ se guardaría. Se verifica
  // explícitamente que quien mira esté asignado como técnico a este servicio.
  const { data: asignado } = await supabase
    .from('servicio_tecnicos')
    .select('id')
    .eq('servicio_id', params.id)
    .eq('tecnico_id', user.id)
    .maybeSingle();
  if (!asignado) notFound();

  return <ServicioTecnicoDetail servicioId={params.id} />;
}
