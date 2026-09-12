'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { FileText, FolderKanban, History, CalendarDays, LayoutDashboard, Warehouse } from 'lucide-react';

// Pestañas superiores del panel del supervisor. Una sola fuente de verdad
// para que las pantallas se sientan como secciones de un mismo panel y no
// como páginas sueltas. En pantallas muy angostas solo se muestra el ícono.
const TABS = [
  { key: 'resumen', label: 'Resumen', href: '/dashboard', Icono: LayoutDashboard },
  { key: 'reportes', label: 'Reportes', href: '/dashboard/reportes', Icono: FileText },
  { key: 'servicios', label: 'Servicios', href: '/dashboard/servicios', Icono: FolderKanban },
  { key: 'agenda', label: 'Agenda', href: '/dashboard/agenda', Icono: CalendarDays },
  { key: 'eventos', label: 'Eventos', href: '/dashboard/eventos', Icono: History },
] as const;

// El almacén solo aparece para quien lo lleva, no para todo supervisor.
const TAB_ALMACEN = { key: 'almacen', label: 'Almacén', href: '/dashboard/almacen', Icono: Warehouse } as const;

export type DashboardTabKey = (typeof TABS)[number]['key'] | 'almacen';

export default function DashboardTabs({ active, mostrarAlmacen }: { active: DashboardTabKey; mostrarAlmacen?: boolean }) {
  // El permiso se consulta aquí para no tener que pasarlo desde cada
  // pantalla. El resultado se guarda en la sesión: no cambia mientras el
  // usuario esté dentro.
  const [puedeAlmacen, setPuedeAlmacen] = useState(mostrarAlmacen ?? false);

  useEffect(() => {
    if (mostrarAlmacen) return;
    const guardado = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('puedeAlmacen') : null;
    if (guardado !== null) {
      setPuedeAlmacen(guardado === 'true');
      return;
    }
    createClient()
      .rpc('puedo_gestionar_almacen')
      .then(({ data }) => {
        const valor = !!data;
        setPuedeAlmacen(valor);
        try { sessionStorage.setItem('puedeAlmacen', String(valor)); } catch { /* modo privado */ }
      });
  }, [mostrarAlmacen]);

  const tabs = puedeAlmacen ? [...TABS, TAB_ALMACEN] : TABS;
  return (
    <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2 border border-line mb-5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`flex-1 min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-display font-semibold tracking-wide transition-colors ${
            active === t.key ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'text-ink/70 active:scale-95'
          }`}
        >
          <t.Icono size={16} strokeWidth={2.4} className="shrink-0" />
          <span className="hidden min-[640px]:inline">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}
