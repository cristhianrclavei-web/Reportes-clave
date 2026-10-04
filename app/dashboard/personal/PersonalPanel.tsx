'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Contact, Lock, UserCog, Users } from 'lucide-react';
import SupervisorShell from '@/components/SupervisorShell';
import SubTabs from '@/components/SubTabs';
import Solicitudes from '@/components/solicitudes/Solicitudes';
import Cuadrillas from '@/components/cuadrillas/Cuadrillas';
import Directorio from '@/components/personal/Directorio';
import Usuarios from '@/components/personal/Usuarios';
import { usePlan } from '@/lib/planes';
import { tieneModulo } from '@/lib/planesDatos';

// Personal: solicitudes (horas extra, vacaciones y permisos; quien autoriza
// ve la bandeja de todos, los demás supervisores las suyas), la ficha del
// equipo (contacto, emergencia, tallas), cuadrillas y, para quien administra
// usuarios, las cuentas (alta, rol, permisos, baja).
// Las cuadrillas son de los paquetes Profesional y Empresa: en Campo la
// pestaña se queda, con la invitación a subir de paquete.
type Sub = 'solicitudes' | 'equipo' | 'cuadrillas' | 'usuarios';

export default function PersonalPanel({ userName, esGestor = false, subInicial }: {
  userName: string;
  // Tiene el permiso de administrar usuarios: ve la pestaña Usuarios.
  esGestor?: boolean;
  subInicial?: string;
}) {
  const [sub, setSub] = useState<Sub>(
    subInicial === 'usuarios' && esGestor ? 'usuarios' : subInicial === 'equipo' || subInicial === 'cuadrillas' ? subInicial : 'solicitudes',
  );
  const plan = usePlan();
  const conCuadrillas = tieneModulo(plan, 'cuadrillas');
  const mostrarPestana = conCuadrillas || plan.plan === 'campo';
  return (
    <SupervisorShell active="personal" title="Personal" userName={userName}>
      <SubTabs
        activa={sub}
        onCambiar={setSub}
        opciones={[
          { k: 'solicitudes' as const, label: 'Solicitudes', Icono: CalendarClock },
          { k: 'equipo' as const, label: 'Equipo', Icono: Contact },
          ...(mostrarPestana ? [{ k: 'cuadrillas' as const, label: 'Cuadrillas', Icono: conCuadrillas ? Users : Lock }] : []),
          ...(esGestor ? [{ k: 'usuarios' as const, label: 'Usuarios', Icono: UserCog }] : []),
        ]}
      />
      {sub === 'usuarios' && esGestor ? (
        <Usuarios />
      ) : sub === 'equipo' ? (
        <Directorio />
      ) : sub === 'solicitudes' || !mostrarPestana ? (
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
