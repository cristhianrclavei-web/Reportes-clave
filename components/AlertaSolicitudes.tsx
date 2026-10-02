'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { puedoAprobarPersonal, recordatorioCorte, fechaBonita } from '@/lib/solicitudesPersonal';

// Aviso en el Resumen para quien autoriza: solicitudes de personal
// pendientes y, si el corte de pago está cerca, cuándo es.
export default function AlertaSolicitudes() {
  const [n, setN] = useState(0);
  const [corte, setCorte] = useState<{ corte: string; faltan: number } | null>(null);

  useEffect(() => {
    setCorte(recordatorioCorte());
    puedoAprobarPersonal().then(async (puede) => {
      if (!puede) return;
      const { count } = await createClient().from('solicitudes_personal').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
      setN(count || 0);
    }).catch(() => {});
  }, []);

  if (n === 0) return null;
  return (
    <Link href="/dashboard/personal" className="mb-4 rounded-2xl bg-teal/8 border border-teal/40 p-3.5 flex items-center gap-3 hover:bg-teal/12 transition-colors">
      <span className="w-10 h-10 rounded-xl bg-teal/15 text-teal flex items-center justify-center shrink-0"><CalendarClock size={19} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{n} solicitud{n > 1 ? 'es' : ''} de personal por autorizar</span>
        <span className="block text-[12.5px] text-muted">
          Horas extra, vacaciones y permisos{corte ? ` · corte de pago ${corte.faltan === 0 ? 'hoy' : `el ${fechaBonita(corte.corte)}`}` : ''}
        </span>
      </span>
      <ChevronRight size={17} className="text-teal shrink-0" />
    </Link>
  );
}
