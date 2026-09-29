import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import FacturasList from './FacturasList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FacturacionPage(props: { searchParams: Promise<{ cliente?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');
  // Sección fuera del plan de la empresa (lib/planes.ts).
  const { data: moduloActivo } = await supabase.rpc('modulo_activo', { p_modulo: 'facturacion' });
  if (moduloActivo === false) redirect('/dashboard');
  const { data: puede } = await supabase.rpc('puedo_gestionar_facturacion');
  if (!puede) redirect('/dashboard');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: facturas, error } = await supabase
    .from('facturas')
    .select('id, folio, cliente_id, estado, fecha, receptor_nombre, moneda, total, folio_fiscal, created_at, profiles!facturas_created_by_profiles_fkey(full_name)')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  // «Nueva factura» desde el detalle de un cliente llega con ?cliente=<id>.
  let clienteInicial: { id: string; nombre: string } | null = null;
  if (searchParams.cliente) {
    const { data: c } = await supabase.from('clientes').select('id, nombre').eq('id', searchParams.cliente).maybeSingle();
    if (c) clienteInicial = c as { id: string; nombre: string };
  }

  return (
    <FacturasList
      facturas={(facturas as any) || []}
      userName={myProfile?.full_name || user.email || ''}
      errorCarga={error?.message || null}
      clienteInicial={clienteInicial}
    />
  );
}
