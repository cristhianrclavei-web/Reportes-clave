'use client';

import SupervisorShell from '@/components/SupervisorShell';
import CotizacionForm from '@/components/CotizacionForm';

export default function NuevaCotizacionClient({
  userName,
  correoUsuario,
}: {
  userName?: string;
  correoUsuario?: string;
}) {
  return (
    <SupervisorShell active="cotizaciones" title="Nueva cotización" userName={userName}>
      <CotizacionForm modo="crear" nombreUsuario={userName} correoUsuario={correoUsuario} />
    </SupervisorShell>
  );
}
