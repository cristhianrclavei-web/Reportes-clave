import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateReportXlsx } from '@/lib/generateReportXlsx';
import { auditarDescarga } from '@/lib/auditarDescarga'; // NUEVO - OWASP A09

export const dynamic = 'force-dynamic';

/**
 * Descarga Excel de un reporte
 * OWASP A01:2021 - Broken Access Control (explicit permission check)
 * OWASP A09:2021 - Logging & Monitoring Failures (audit trail)
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: report, error } = await supabase
    .from('reports')
    .select('id, created_at, empresa_cliente, fecha, tipo_servicio, sub_tipo_servicio, data, created_by, profiles!reports_created_by_profiles_fkey(full_name)')
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
  }

  // ===== DEFENSA EN CAPAS: Verificar permisos explícitamente (OWASP A01) =====
  const isTechnicianOwner = report.created_by === user.id;
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isSupervisor = userProfile?.role === 'supervisor';

  if (!isTechnicianOwner && !isSupervisor) {
    console.warn(
      `[SECURITY] Unauthorized XLSX download attempt: user ${user.id} tried to access report ${params.id}`
    );
    return NextResponse.json(
      { error: 'No tienes permiso para descargar este reporte' },
      { status: 403 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = await generateReportXlsx(report as any);
  } catch (err: any) {
    console.error('[xlsx-route] Error generando Excel:', err?.message, err?.stack);
    return NextResponse.json({ error: 'Error al generar el Excel: ' + (err?.message || 'desconocido') }, { status: 500 });
  }

  // ===== AUDITORÍA (OWASP A09) =====
  const ipAddress = request.headers.get('x-forwarded-for') ||
                    request.headers.get('cf-connecting-ip') ||
                    request.ip ||
                    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const auditResult = await auditarDescarga(
    supabase,
    params.id,
    user.id,
    'xlsx',
    ipAddress,
    userAgent
  );

  if (!auditResult.success) {
    console.error('[SECURITY] Auditoría fallida:', auditResult.error);
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-${report.fecha}-${report.empresa_cliente.replace(/[^a-z0-9]+/gi, '-')}.xlsx"`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}
