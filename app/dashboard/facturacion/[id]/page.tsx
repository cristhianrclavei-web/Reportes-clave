import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import FacturaDetalle from './FacturaDetalle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FacturaDetallePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');
  const { data: puede } = await supabase.rpc('puedo_gestionar_facturacion');
  if (!puede) redirect('/dashboard');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const [{ data: factura, error }, { data: rel }] = await Promise.all([
    supabase.from('facturas').select('*, profiles!facturas_created_by_profiles_fkey(full_name)').eq('id', params.id).single(),
    supabase.from('factura_reportes').select('report_id').eq('factura_id', params.id),
  ]);
  if (error || !factura) notFound();

  const ids = (rel || []).map((r: any) => r.report_id as string);
  const [{ data: reportes }, { data: cotizacion }, { data: cliente }] = await Promise.all([
    ids.length
      ? supabase.from('reports').select('id, fecha, folio:data->>claveFormato, ing:data->>ingACargo').in('id', ids).order('fecha')
      : Promise.resolve({ data: [] as any[] }),
    factura.cotizacion_id
      ? supabase.from('cotizaciones').select('id, folio, fecha, total, moneda').eq('id', factura.cotizacion_id).maybeSingle()
      : Promise.resolve({ data: null }),
    factura.cliente_id
      ? supabase.from('clientes').select('id, nombre').eq('id', factura.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <FacturaDetalle
      facturaInicial={factura as any}
      reportes={(reportes as any) || []}
      cotizacion={(cotizacion as any) || null}
      cliente={(cliente as any) || null}
      userName={myProfile?.full_name || user.email || ''}
    />
  );
}
