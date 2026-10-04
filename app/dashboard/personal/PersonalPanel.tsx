'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Lock, Users } from 'lucide-react';
import SupervisorShell from '@/components/SupervisorShell';
import SubTabs from '@/components/SubTabs';
import Solicitudes from '@/components/solicitudes/Solicitudes';
import Cuadrillas from '@/components/cuadrillas/Cuadrillas';
import { usePlan } from '@/lib/planes';
import { tieneModulo } from '@/lib/planesDatos';

// Personal: solicitudes (horas extra, vacaciones y permisos; quien autoriza
// ve la bandeja de todos, los demás supervisores las suyas) y cuadrillas.
// Las cuadrillas son de los paquetes Profesional y Empresa: en Campo la
// pestaña se queda, con la invitación a subir de paquete.
export default function PersonalPanel({ userName }: { userName: string }) {
  const [sub, setSub] = useState<'solicitudes' | 'cuadrillas'>('solicitudes');
  const plan = usePlan();
  const conCuadrillas = tieneModulo(plan, 'cuadrillas');
  const mostrarPestana = conCuadrillas || plan.plan === 'campo';
  return (
    <SupervisorShell active="personal" title="Personal" userName={userName}>
      {mostrarPestana && (
        <SubTabs
          activa={sub}
          onCambiar={setSub}
          opciones={[
            { k: 'solicitudes', label: 'Solicitudes', Icono: CalendarClock },
            { k: 'cuadrillas', label: 'Cuadrillas', Icono: conCuadrillas ? Users : Lock },
          ]}
        />
      )}
      {sub === 'solicitudes' || !mostrarPestana ? (
        <Solicitudes nombre={userName} />
      ) : conCuadrillas ? (
        <Cuadrillas />
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong px-5 py-10 text-center">
          <Lock size={24} className="mx-auto text-muted mb-2" />
          <p className="text-[15px] font-semibold">Cuadrillas es parte de los paquetes Profesional y Empresa</p>
          <p className="text-[13.5px] text-muted mt-1 max-w-md mx-auto">
            Agrupa a tu personal, filtra el tablero y la agenda por cuadrilla y asigna un servicio a todo el grupo de un toque.
          </p>
          <Link href="/suscripcion" className="inline-flex mt-4 min-h-[44px] px-5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] items-center">
            Ver paquetes
          </Link>
        </div>
      )}
    </SupervisorShell>
  );
}
