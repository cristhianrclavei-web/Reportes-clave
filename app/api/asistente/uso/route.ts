import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { MARCA, hoyNegocio } from '@/lib/marca';

export const dynamic = 'force-dynamic';

// Panel de uso del asistente. Lo ve solo quien administra el asistente: las
// cuentas cuyo correo esté en ASISTENTE_PANEL_CORREOS (separados por coma).
// No es un permiso de rol porque incluye lo que pregunta cada persona y el
// gasto de la cuenta de Claude.
const CORREOS_PANEL = (process.env.ASISTENTE_PANEL_CORREOS || 'cristhianmonster503@gmail.com')
  .split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);

// Respuestas donde el asistente no pudo ayudar: sirven de guía para mejorarlo.
const NO_SUPO = /\b(no encontr[ée]|no tengo|no puedo|no pude|no est[áa] disponible|no hay (ning[úu]n|nadie|datos)|no alcanc[ée])\b/i;

const diaLocal = (ts: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: MARCA.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!CORREOS_PANEL.includes((user.email || '').toLowerCase())) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 });
  if (!hayClienteAdmin()) return NextResponse.json({ error: 'Falta configurar SUPABASE_SECRET_KEY en el servidor.' }, { status: 503 });

  const admin = createAdminClient();
  const desde = new Date(Date.now() - 31 * 24 * 3600_000).toISOString();
  // select('*') a propósito: las columnas de costo pueden no existir todavía
  // (patch_asistente_uso_costo.sql) y pedirlas por nombre haría fallar todo.
  const [{ data: filas, error }, { data: perfiles }] = await Promise.all([
    admin.from('asistente_uso').select('*').gte('created_at', desde).order('created_at', { ascending: false }).limit(5000),
    admin.from('profiles').select('id, full_name, role'),
  ]);
  if (error) return NextResponse.json({ error: 'No se pudo leer el uso' }, { status: 500 });

  const nombres = new Map(((perfiles as any[]) || []).map((p) => [p.id, { nombre: p.full_name as string, rol: p.role as string }]));
  const hoy = hoyNegocio();
  const hace7 = diaLocal(new Date(Date.now() - 6 * 24 * 3600_000).toISOString());
  const lista = (filas as any[]) || [];
  // ¿La base ya tiene las columnas de costo? (Las consultas anteriores al
  // parche quedan sin costo y suman cero.)
  const conCosto = lista.length > 0 && 'costo_usd' in lista[0];

  const total = { hoy: 0, semana: 0, mes: 0, costoHoy: 0, costoSemana: 0, costoMes: 0, busquedas: 0, conFoto: 0 };
  const porPersona = new Map<string, { nombre: string; rol: string; hoy: number; semana: number; mes: number; costoMes: number; ultima: string }>();
  const porDia = new Map<string, { mensajes: number; costo: number }>();
  const herramientas = new Map<string, number>();
  const sinRespuesta: { cuando: string; quien: string; pregunta: string; respuesta: string }[] = [];

  for (const f of lista) {
    const dia = diaLocal(f.created_at);
    const costo = Number(f.costo_usd) || 0;
    const esHoy = dia === hoy;
    const esSemana = dia >= hace7;
    total.mes++; total.costoMes += costo;
    if (esSemana) { total.semana++; total.costoSemana += costo; }
    if (esHoy) { total.hoy++; total.costoHoy += costo; }
    total.busquedas += Number(f.busquedas) || 0;
    if (f.con_imagen) total.conFoto++;

    const quien = nombres.get(f.user_id) || { nombre: 'Cuenta eliminada', rol: '' };
    const p = porPersona.get(f.user_id) || { ...quien, hoy: 0, semana: 0, mes: 0, costoMes: 0, ultima: f.created_at };
    p.mes++; p.costoMes += costo;
    if (esSemana) p.semana++;
    if (esHoy) p.hoy++;
    porPersona.set(f.user_id, p);

    const d = porDia.get(dia) || { mensajes: 0, costo: 0 };
    d.mensajes++; d.costo += costo;
    porDia.set(dia, d);

    // code_execution es una pieza interna de la búsqueda en internet.
    for (const h of (f.herramientas as string[]) || []) if (h !== 'code_execution') herramientas.set(h, (herramientas.get(h) || 0) + 1);
    if (sinRespuesta.length < 40 && NO_SUPO.test(f.respuesta || '')) {
      sinRespuesta.push({ cuando: f.created_at, quien: quien.nombre, pregunta: String(f.pregunta || '').slice(0, 240), respuesta: String(f.respuesta || '').slice(0, 320) });
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({
    conCosto,
    total: { ...total, costoHoy: r2(total.costoHoy), costoSemana: r2(total.costoSemana), costoMes: r2(total.costoMes) },
    personas: [...porPersona.values()].map((p) => ({ ...p, costoMes: r2(p.costoMes) })).sort((a, b) => b.mes - a.mes),
    dias: [...porDia].map(([dia, d]) => ({ dia, mensajes: d.mensajes, costo: r2(d.costo) })).sort((a, b) => (a.dia < b.dia ? 1 : -1)).slice(0, 14),
    herramientas: [...herramientas].map(([nombre, veces]) => ({ nombre, veces })).sort((a, b) => b.veces - a.veces).slice(0, 12),
    sinRespuesta,
  });
}
