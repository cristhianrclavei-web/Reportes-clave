'use client';

import { useState } from 'react';
import { CalendarClock, Users } from 'lucide-react';
import SupervisorShell from '@/components/SupervisorShell';
import SubTabs from '@/components/SubTabs';
import Solicitudes from '@/components/solicitudes/Solicitudes';
import Cuadrillas from '@/components/cuadrillas/Cuadrillas';

// Personal: solicitudes (horas extra, vacaciones y permisos; quien autoriza
// ve la bandeja de todos, los demás supervisores las suyas) y cuadrillas.
export default function PersonalPanel({ userName }: { userName: string }) {
  const [sub, setSub] = useState<'solicitudes' | 'cuadrillas'>('solicitudes');
  return (
    <SupervisorShell active="personal" title="Personal" userName={userName}>
      <SubTabs
        activa={sub}
        onCambiar={setSub}
        opciones={[
          { k: 'solicitudes', label: 'Solicitudes', Icono: CalendarClock },
          { k: 'cuadrillas', label: 'Cuadrillas', Icono: Users },
        ]}
      />
      {sub === 'solicitudes' ? <Solicitudes nombre={userName} /> : <Cuadrillas />}
    </SupervisorShell>
  );
}
