'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { EquipoInstalado, listarEquiposSinRegistro, textoEquipo } from '@/lib/equiposInstalados';
import { createClient } from '@/lib/supabaseClient';

// Alerta persistente para supervisores y almacenista: equipo instalado en un
// reporte que no está en el almacén. No se puede cerrar: desaparece cuando
// el almacenista registra cada equipo (Almacén → Instalados).

export default function AlertaEquiposSinRegistro({ enAlmacen, onIr }: { enAlmacen?: boolean; onIr?: () => void }) {
  const [lista, setLista] = useState<EquipoInstalado[] | null>(null);
  const [ver, setVer] = useState(false);
  // Un supervisor sin permiso de almacén ve la alerta pero no el enlace.
  const [puedeAlmacen, setPuedeAlmacen] = useState(false);
  useEffect(() => {
    if (!enAlmacen) createClient().rpc('puedo_gestionar_almacen').then(({ data }) => setPuedeAlmacen(!!data));
  }, [enAlmacen]);

  useEffect(() => {
    let vivo = true;
    const cargar = () => listarEquiposSinRegistro().then((l) => vivo && setLista(l)).catch(() => vivo && setLista([]));
    cargar();
    const t = setInterval(cargar, 120000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  if (!lista || lista.length === 0) return null;
  const folios = [...new Set(lista.map((e) => e.folio).filter(Boolean))];

  return (
    <div className="mb-4 rounded-2xl bg-amber/10 border border-amber/40 p-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} className="text-amber shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-amber">
            {lista.length === 1 ? 'Equipo instalado sin registro en almacén' : `${lista.length} equipos instalados sin registro en almacén`}
            {folios.length > 0 && <span className="font-normal"> · folio {folios.slice(0, 3).join(', ')}{folios.length > 3 ? '…' : ''}</span>}
          </p>
          {ver && (
            <ul className="mt-1.5 text-[12.5px] text-ink/80 space-y-0.5">
              {lista.slice(0, 8).map((e) => (
                <li key={e.id} className="truncate">{e.cantidad} × {textoEquipo(e)} · {e.cliente} · folio {e.folio || '—'}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
            <button type="button" onClick={() => setVer((v) => !v)} className="text-[12.5px] font-semibold text-ink/70 min-h-[30px]">{ver ? 'Ocultar' : 'Ver cuáles'}</button>
            {enAlmacen ? (
              onIr && <button type="button" onClick={onIr} className="text-[12.5px] font-semibold text-teal min-h-[30px] flex items-center">Registrar <ChevronRight size={14} /></button>
            ) : puedeAlmacen && (
              <Link href="/dashboard/almacen?sub=instalados" className="text-[12.5px] font-semibold text-teal min-h-[30px] flex items-center">Ir al almacén <ChevronRight size={14} /></Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
