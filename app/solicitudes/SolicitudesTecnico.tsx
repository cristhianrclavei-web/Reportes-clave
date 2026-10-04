'use client';

import PerfilChip from '@/components/PerfilChip';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import TecnicoTabs from '@/components/TecnicoTabs';
import Logo from '@/components/Logo';
import Solicitudes from '@/components/solicitudes/Solicitudes';

export default function SolicitudesTecnico({ userName }: { userName: string }) {
  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-10">
      <div className="sticky top-0 z-20 bg-bg pb-2">
        <div className="barra-fija px-5 pb-3 flex items-center justify-between gap-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
          <Logo variante="completo" size={34} className="min-w-0" compactoEnMovil />
          <div className="flex items-center gap-1 shrink-0">
            <PerfilChip nombre={userName} respaldo="Personal técnico" />
            <ThemeToggle />
            <LogoutButton compacto />
          </div>
        </div>
        <TecnicoTabs active="solicitudes" />
      </div>
      <div className="px-4 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-1">Solicitudes</h1>
        <p className="text-[15px] text-muted font-medium mb-4">Horas extra, vacaciones y permisos</p>
        <Solicitudes nombre={userName} />
      </div>
    </div>
  );
}
