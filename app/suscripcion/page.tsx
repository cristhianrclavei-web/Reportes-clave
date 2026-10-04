import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseServer';
import Logo from '@/components/Logo';
import PanelSupervisor from '@/components/PanelSupervisor';
import ThemeToggle from '@/components/ThemeToggle';
import { ChevronLeft, Check, MessageCircle, Mail, Users, CalendarClock } from 'lucide-react';
import {
  PLANES, PlanClave, MiPlan, PRECIO_USUARIO_EXTRA, MESES_PAGADOS_EN_ANUAL,
  VENTAS_WHATSAPP, VENTAS_CORREO, fechaCorta, dias, dinero,
} from '@/lib/planesDatos';
import { MARCA } from '@/lib/marca';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Pago = {
  id: string;
  created_at: string;
  plan: string;
  periodo: string;
  monto: number;
  usuarios_extra: number;
  referencia: string | null;
  vence_nuevo: string;
};

const ESTADO: Record<string, { texto: string; cls: string }> = {
  sin_vencimiento: { texto: 'Licencia sin vencimiento', cls: 'bg-teal/12 text-teal' },
  prueba: { texto: 'Prueba demo', cls: 'bg-amber/15 text-amber' },
  activa: { texto: 'Activa', cls: 'bg-teal/12 text-teal' },
  gracia: { texto: 'Vencida · periodo de gracia', cls: 'bg-red/12 text-red' },
  vencida: { texto: 'Vencida · solo lectura', cls: 'bg-red/12 text-red' },
};

function enlaceContratar(plan: PlanClave, periodo: 'mensual' | 'anual'): string | null {
  const mensaje = `Hola, soy de ${MARCA.nombre}. Quiero contratar el plan ${PLANES[plan].nombre} (${periodo}) de ${MARCA.appNombre}.`;
  if (VENTAS_WHATSAPP) return `https://wa.me/${VENTAS_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;
  if (VENTAS_CORREO) return `mailto:${VENTAS_CORREO}?subject=${encodeURIComponent(`Contratar plan ${PLANES[plan].nombre}`)}&body=${encodeURIComponent(mensaje)}`;
  return null;
}

export default async function SuscripcionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase.rpc('mi_plan');
  const plan = data as MiPlan | null;
  if (!plan?.es_supervisor) redirect('/mis-reportes');

  const { data: pagosData } = await supabase
    .from('suscripcion_pagos')
    .select('id, created_at, plan, periodo, monto, usuarios_extra, referencia, vence_nuevo')
    .order('created_at', { ascending: false })
    .limit(24);
  const pagos = (pagosData || []) as Pago[];

  const s = plan.suscripcion;
  const fase = s?.fase || 'sin_vencimiento';
  const estado = ESTADO[fase];
  const restantes = s?.dias_restantes ?? null;
  const conVencimiento = fase !== 'sin_vencimiento' && !!s?.vence_en;
  const hayContacto = !!(VENTAS_WHATSAPP || VENTAS_CORREO);

  const { data: perfil } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  // Dentro del panel del supervisor, como cualquier otra sección; en
  // computadora sobra el encabezado propio de esta página.
  return (
    <PanelSupervisor userName={perfil?.full_name || user.email || ''}>
    <div className="max-w-2xl lg:max-w-6xl 2xl:max-w-[1400px] mx-auto pb-28 lg:pb-16 lg:px-8">
      <div className="lg:hidden sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/dashboard"
            aria-label="Volver"
            className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-5 lg:px-0 lg:pt-8">
        <h1 className="font-display font-bold text-2xl lg:text-[34px] lg:leading-tight tracking-wide mb-1.5">Suscripción</h1>
        <p className="text-[15px] text-muted font-medium mb-5">Tu plan, los días que quedan y los paquetes disponibles</p>

        {/* ---------- Plan actual ---------- */}
        <div className="rounded-2xl bg-surface border border-line p-5 mb-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[12px] uppercase tracking-wider text-muted font-semibold">Plan actual</p>
              <p className="font-display font-bold text-[28px] leading-tight tracking-wide">
                {PLANES[plan.plan]?.nombre || plan.plan}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[12.5px] font-semibold ${estado.cls}`}>{estado.texto}</span>
          </div>

          {conVencimiento && restantes !== null && (fase === 'prueba' || fase === 'activa') && (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-display font-bold text-[44px] leading-none tabular-nums">{restantes}</span>
              <span className="text-[15px] text-muted font-medium">
                {restantes === 1 ? 'día restante (hoy es el último)' : 'días restantes'}
              </span>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[13.5px]">
            {conVencimiento && (
              <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-line px-3.5 py-2.5">
                <CalendarClock size={16} className="text-muted shrink-0" />
                <span>
                  {fase === 'prueba' ? 'La prueba termina' : fase === 'activa' ? 'Pagado hasta' : 'Venció'} el{' '}
                  <b>{fechaCorta(s?.vence_en)}</b>
                  {s?.periodo ? ` · ${s.periodo}` : ''}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-line px-3.5 py-2.5">
              <Users size={16} className="text-muted shrink-0" />
              <span className="tabular-nums">
                {plan.usuarios_activos}
                {plan.limite_usuarios ? ` de ${plan.limite_usuarios}` : ''} usuarios activos
              </span>
            </div>
          </div>

          {fase === 'gracia' && (
            <p className="mt-4 text-[13.5px] text-red font-medium">
              Tienes {dias(s?.dias_gracia_restantes ?? 0)} (hasta el {fechaCorta(s?.fin_gracia)}) para renovar. Después
              la app queda en solo lectura: se puede consultar y descargar, pero no crear ni editar.
            </p>
          )}
          {fase === 'vencida' && (
            <p className="mt-4 text-[13.5px] text-red font-medium">
              La app está en solo lectura. Toda tu información sigue guardada: al renovar, todo vuelve a funcionar como antes.
            </p>
          )}
          {fase === 'prueba' && (
            <p className="mt-4 text-[13.5px] text-muted">
              Durante la prueba tienes todo incluido (paquete Empresa). Al contratar eliges el paquete que te conviene y
              conservas toda la información capturada.
            </p>
          )}
        </div>

        {/* ---------- Paquetes ---------- */}
        <h2 className="font-display font-bold text-[21px] tracking-wide mb-1">Paquetes</h2>
        <p className="text-[13.5px] text-muted mb-4">
          Precios en MXN al mes, más IVA. Pago anual: 12 meses por el precio de {MESES_PAGADOS_EN_ANUAL}.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 mb-4">
          {(Object.keys(PLANES) as PlanClave[]).map((clave) => {
            const p = PLANES[clave];
            const actual = clave === plan.plan && fase !== 'prueba';
            const destacado = clave === 'profesional';
            const mensual = enlaceContratar(clave, 'mensual');
            const anual = enlaceContratar(clave, 'anual');
            return (
              <div
                key={clave}
                className={`rounded-2xl bg-surface border p-5 flex flex-col ${
                  actual ? 'border-teal' : destacado ? 'border-amber/60' : 'border-line'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display font-bold text-[22px] tracking-wide">{p.nombre}</p>
                  {actual ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-teal/12 text-teal">Tu plan</span>
                  ) : destacado ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-amber/15 text-amber">Recomendado</span>
                  ) : null}
                </div>
                <p className="text-[13px] text-muted mb-3">{p.lema}</p>
                <p className="mb-0.5">
                  <span className="font-display font-bold text-[32px] tabular-nums">{dinero(p.precioMensual)}</span>
                  <span className="text-[13px] text-muted"> /mes</span>
                </p>
                <p className="text-[12.5px] text-muted mb-4 tabular-nums">
                  o {dinero(p.precioMensual * MESES_PAGADOS_EN_ANUAL)} al año
                </p>
                <ul className="space-y-1.5 text-[13.5px] mb-5">
                  <li className="flex gap-2"><Check size={16} className="text-teal shrink-0 mt-0.5" />Hasta {p.usuarios} usuarios</li>
                  {p.incluye.map((i) => (
                    <li key={i} className="flex gap-2"><Check size={16} className="text-teal shrink-0 mt-0.5" />{i}</li>
                  ))}
                </ul>
                {mensual && anual && (
                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <a
                      href={mensual}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[13.5px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                    >
                      {VENTAS_WHATSAPP ? <MessageCircle size={15} /> : <Mail size={15} />}
                      {actual ? 'Renovar' : 'Mensual'}
                    </a>
                    <a
                      href={anual}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] rounded-xl border border-line-strong font-semibold text-[13.5px] flex items-center justify-center active:scale-95 transition-transform"
                    >
                      Anual
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[13px] text-muted mb-8">
          ¿Necesitas más usuarios sin cambiar de paquete? Cada usuario extra cuesta {dinero(PRECIO_USUARIO_EXTRA)} al mes.
          {!hayContacto && ' Para contratar o renovar, contacta a tu proveedor de la app.'}
        </p>

        {/* ---------- Pagos ---------- */}
        {pagos.length > 0 && (
          <>
            <h2 className="font-display font-bold text-[21px] tracking-wide mb-3">Pagos registrados</h2>
            <div className="rounded-2xl bg-surface border border-line divide-y divide-line mb-6">
              {pagos.map((pg) => (
                <div key={pg.id} className="px-4 py-3 flex items-center justify-between gap-3 text-[13.5px]">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {PLANES[pg.plan as PlanClave]?.nombre || pg.plan} · {pg.periodo}
                      {pg.usuarios_extra > 0 ? ` · +${pg.usuarios_extra} usuarios` : ''}
                    </p>
                    <p className="text-muted text-[12.5px] truncate">
                      {fechaCorta(pg.created_at.slice(0, 10))}
                      {pg.referencia ? ` · ${pg.referencia}` : ''} · cubre hasta el {fechaCorta(pg.vence_nuevo)}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums shrink-0">{dinero(Number(pg.monto))}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </PanelSupervisor>
  );
}
