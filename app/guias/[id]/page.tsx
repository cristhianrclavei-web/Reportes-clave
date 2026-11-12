import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import GuiaDetalle from './GuiaDetalle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Una guía de conexión: diagrama, conexiones con palomita, pruebas y notas.
// La abren técnicos y supervisión; solo supervisión edita el dibujo.
export default async function GuiaPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/guias/${id}`);

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor' && role !== 'tecnico') redirect('/login');

  const { data: perfil } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return <GuiaDetalle guiaId={id} usuarioId={user.id} usuarioNombre={perfil?.full_name || user.email || 'Sin nombre'} esSupervisor={role === 'supervisor'} />;
}
