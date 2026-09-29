import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import AlmacenList from './AlmacenList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AlmacenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/mis-reportes');
  // Sección fuera del plan de la empresa (lib/planes.ts).
  const { data: moduloActivo } = await supabase.rpc('modulo_activo', { p_modulo: 'almacen' });
  if (moduloActivo === false) redirect('/dashboard');

  // El almacén lo lleva una persona concreta, no cualquier supervisor.
  const { data: puede } = await supabase.rpc('puedo_gestionar_almacen');
  if (!puede) redirect('/dashboard');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return <AlmacenList userName={profile?.full_name || user.email || ''} />;
}
