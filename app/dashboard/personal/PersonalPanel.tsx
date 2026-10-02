'use client';

import SupervisorShell from '@/components/SupervisorShell';
import Solicitudes from '@/components/solicitudes/Solicitudes';

// Personal: horas extra, vacaciones y permisos. Quien autoriza ve la
// bandeja de todos; los demás supervisores, las suyas.
export default function PersonalPanel({ userName }: { userName: string }) {
  return (
    <SupervisorShell active="personal" title="Personal" userName={userName}>
      <Solicitudes nombre={userName} />
    </SupervisorShell>
  );
}
