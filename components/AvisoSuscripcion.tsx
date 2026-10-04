'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, Lock, AlertTriangle } from 'lucide-react';
import { usePlan } from '@/lib/planes';
import { fechaCorta, dias } from '@/lib/planesDatos';

// Pantallas sin sesión (o del cliente final): ahí no se habla del plan.
const PUBLICAS = ['/login', '/firmar', '/verificar', '/restablecer', '/aviso-privacidad'];

// En la suscripción pagada, el supervisor ve la franja solo en los últimos días.
const AVISAR_DESDE_DIAS = 10;

// Franja superior con los días de la prueba demo o de la suscripción.
//   · prueba: todos la ven.
//   · activa: solo supervisores, y solo los últimos 10 días.
//   · gracia / vencida: todos (el técnico debe saber por qué no puede capturar).
// Los días los calcula la base con la fecha de México (estado_suscripcion()).
export default function AvisoSuscripcion() {
  const pathname = usePathname();
  const plan = usePlan();
  const s = plan.suscripcion;
  if (!s || PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;

  const sup = plan.es_supervisor === true;
  const restantes = s.dias_restantes ?? 0;

  let tono: 'amber' | 'red';
  let Icono = Clock;
  let texto: string;
  let accion: string | null = sup ? 'Ver planes' : null;

  switch (s.fase) {
    case 'prueba':
      tono = 'amber';
      texto = restantes <= 1
        ? 'Prueba demo · hoy es el último día'
        : `Prueba demo · quedan ${dias(restantes)}`;
      accion = sup ? 'Contratar' : null;
      break;
    case 'activa':
      if (!sup || restantes > AVISAR_DESDE_DIAS) return null;
      tono = 'amber';
      texto = restantes <= 1
        ? 'Tu suscripción vence hoy'
        : `Tu suscripción vence en ${dias(restantes)} (${fechaCorta(s.vence_en)})`;
      accion = 'Renovar';
      break;
    case 'gracia':
      tono = 'red';
      Icono = AlertTriangle;
      {
        // Días de cortesía: el aviso va en rojo y cuenta hacia atrás.
        const cortesia = s.dias_gracia_restantes ?? 0;
        const queda = cortesia <= 1 ? 'último día de cortesía' : `quedan ${cortesia} días de cortesía`;
        const que = s.estado === 'prueba' ? 'Tu prueba demo venció' : 'Tu suscripción venció';
        texto = sup
          ? `${que} · ${queda} · contacta para actualizar tu membresía`
          : `${que} · ${queda} · avisa a tu supervisor`;
      }
      accion = sup ? 'Actualizar membresía' : null;
      break;
    case 'vencida':
      tono = 'red';
      Icono = Lock;
      texto = `${s.estado === 'prueba' ? 'La prueba demo terminó' : 'La suscripción venció'} · la app está en solo lectura: se puede consultar y descargar, pero no crear ni editar`;
      accion = sup ? 'Actualizar membresía' : null;
      break;
    default:
      return null;
  }

  const colores = tono === 'red'
    ? 'bg-red/12 text-red border-red/25'
    : 'bg-amber/12 text-amber border-amber/25';

  return (
    <div
      role="status"
      className={`relative z-30 border-b ${colores} text-[13px] font-semibold`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
        <Icono size={15} strokeWidth={2.4} className="shrink-0" />
        <span className="min-w-0">{texto}</span>
        {accion && (
          <Link href="/suscripcion#paquetes" className="shrink-0 underline underline-offset-2 decoration-2 ml-1">
            {accion}
          </Link>
        )}
      </div>
    </div>
  );
}
