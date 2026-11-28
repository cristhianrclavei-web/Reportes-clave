import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabaseServer';
import { generateCotizacionPdf } from '@/lib/generateCotizacionPdf';
import { cotizacionDeVistaPrevia, type CotizacionInput } from '@/lib/cotizaciones';

export const dynamic = 'force-dynamic';

// Vista previa: arma el PDF con lo que está capturado en el formulario, sin
// guardar nada. Recibe los mismos datos que se mandarían al guardar.

const texto = (max: number) => z.string().max(max);

const esquemaLinea = z.object({
  sistema: texto(120),
  titulo_sistema: texto(200).nullish(),
  opcional: z.boolean().optional(),
  descripcion: texto(5000),
  unidad: texto(40),
  cantidad: z.number().finite(),
  costo: z.number().finite(),
  margen_pct: z.number().finite(),
  precio_unitario: z.number().finite(),
  enlace: texto(1000).nullish(),
  foto: texto(2000).nullish(),
  modelo: texto(120).nullish(),
  marca: texto(120).nullish(),
});

const esquema = z.object({
  folio: texto(60),
  cotizacion: z.object({
    fecha: texto(20),
    titulo_proyecto: texto(200),
    atencion: texto(200),
    empresa: texto(200),
    telefono: texto(60),
    correo: texto(200),
    direccion: texto(500),
    forma_pago: texto(1000),
    tiempo_entrega: texto(2000),
    garantia: texto(4000),
    vigencia_dias: z.number().int().min(0).max(3650),
    notas: texto(4000),
    firmante_nombre: texto(200),
    firmante_correo: texto(200),
    iva_pct: z.number().min(0).max(100),
    moneda: z.enum(['MXN', 'USD']),
    presentacion_precios: z.enum(['desglose', 'kit']),
    mostrar_fotos: z.boolean(),
    iva_incluido: z.boolean(),
    total_neto: z.boolean(),
    tipo_cambio: z.number().finite().min(0),
    lineas: z.array(esquemaLinea).max(1000),
  }),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Tu sesión expiró. Vuelve a entrar.' }, { status: 401 });
  }
  // Mismo permiso que el PDF de una cotización guardada.
  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') {
    return NextResponse.json({ error: 'No tienes permiso para ver cotizaciones' }, { status: 403 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'No llegaron los datos de la cotización.' }, { status: 400 });
  }
  const revisado = esquema.safeParse(cuerpo);
  if (!revisado.success) {
    console.error('[cotizacion-vista-previa] Datos inválidos:', revisado.error.issues.slice(0, 3));
    return NextResponse.json({ error: 'Hay datos de la cotización que no se pueden leer. Revisa las partidas e intenta de nuevo.' }, { status: 400 });
  }

  const { cotizacion, lineas } = cotizacionDeVistaPrevia(revisado.data.cotizacion as CotizacionInput, revisado.data.folio);

  try {
    const pdf = await generateCotizacionPdf(cotizacion, lineas);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    console.error('[cotizacion-vista-previa] Error generando PDF:', err?.message, err?.stack);
    return NextResponse.json({ error: 'No se pudo armar la vista previa. Intenta de nuevo.' }, { status: 500 });
  }
}
