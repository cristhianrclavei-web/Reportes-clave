import { createClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Página temporal de diagnóstico: muestra exactamente lo que ve el SERVIDOR
// (no el navegador) al consultar Supabase. Sirve para distinguir un problema
// de sesión, de permisos (RLS) o de configuración. Se puede borrar después.
export default async function DiagnosticoPage() {
  const supabase = createClient();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '(no definida)';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const { data: { user }, error: errorUser } = await supabase.auth.getUser();
  const { data: role, error: errorRole } = await supabase.rpc('get_my_role');

  const { data: reports, error: errorReports, count } = await supabase
    .from('reports')
    .select('id, empresa_cliente, created_by', { count: 'exact' })
    .limit(5);

  const filas: [string, string][] = [
    ['URL de Supabase', url],
    ['¿URL bien formada?', url.endsWith('.supabase.co') ? 'Sí' : 'NO — no debe llevar /rest/v1/ ni barra final'],
    ['Llave anon', anonKey ? `definida (${anonKey.length} caracteres, empieza con ${anonKey.slice(0, 6)}…)` : 'NO DEFINIDA'],
    ['Usuario en sesión', user ? `${user.email} (${user.id})` : 'SIN SESIÓN'],
    ['Error de sesión', errorUser?.message || '—'],
    ['Rol según la base', (role as any) ?? 'null — get_my_role() no devolvió nada'],
    ['Error de rol', errorRole?.message || '—'],
    ['Reportes visibles', count === null ? 'sin conteo' : String(count)],
    ['Error al consultar reportes', errorReports?.message || '—'],
  ];

  return (
    <div className="max-w-2xl mx-auto p-5">
      <h1 className="font-display font-bold text-xl mb-1">Diagnóstico de conexión</h1>
      <p className="text-[13px] text-muted mb-5">
        Esto es lo que ve el servidor de Next.js al hablar con Supabase. Página temporal.
      </p>

      <div className="flex flex-col gap-2.5">
        {filas.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 border border-line p-3.5">
            <p className="text-[12px] text-muted mb-1">{k}</p>
            <p className="text-[13.5px] font-mono break-all">{v}</p>
          </div>
        ))}
      </div>

      {reports && reports.length > 0 && (
        <div className="mt-5">
          <p className="text-[13px] font-semibold mb-2">Primeros reportes visibles:</p>
          {reports.map((r: any) => (
            <p key={r.id} className="text-[12.5px] text-muted font-mono break-all mb-1">
              {r.empresa_cliente} — creado por {r.created_by}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
