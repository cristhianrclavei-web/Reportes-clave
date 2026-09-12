'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import TecnicoTabs from '@/components/TecnicoTabs';
import InsumosChecklist from '@/components/InsumosChecklist';
import ModalOverlay from '@/components/ModalOverlay';
import Logo from '@/components/Logo';
import { listarMisChecklists, MiChecklist } from '@/lib/insumos';
import {
  X, ChevronRight, PackageCheck, PackageX, Wrench, Package, HardHat,
  PackagePlus, Clock, Check,
} from 'lucide-react';

function fmtFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Estado del ciclo del día, resumido en una etiqueta: es lo primero que el
// técnico quiere saber al abrir la sección.
function estadoDelDia(c: MiChecklist): { label: string; cls: string; Icono: any } {
  if (c.recibidoEnAlmacen) return { label: 'Cerrado', cls: 'bg-teal/15 text-teal', Icono: Check };
  if (c.devolucionFirmada) return { label: 'Esperando almacén', cls: 'bg-amber/15 text-amber', Icono: Clock };
  if (c.salidaFirmada) return { label: 'En tu resguardo', cls: 'bg-teal/15 text-teal', Icono: PackageCheck };
  return { label: 'Por recibir', cls: 'bg-amber/15 text-amber', Icono: PackageX };
}

export default function MisChecklistsList({ userName }: { userName?: string }) {
  const [lista, setLista] = useState<MiChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<MiChecklist | null>(null);

  async function cargar() {
    try {
      setLista(await listarMisChecklists());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las listas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-10">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <Logo variante="completo" size={34} className="min-w-0" compactoEnMovil />
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-1">Herramienta y material</h1>
        <p className="text-[15px] text-muted font-medium mb-4">{userName || 'Técnico'}</p>

        <TecnicoTabs active="checklists" />

        {loading && (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1].map((i) => <div key={i} className="rounded-2xl bg-surface-2 h-[120px] animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar las listas</p>
            <p className="text-[13px] text-ink/80 leading-relaxed">{error}</p>
          </div>
        )}

        {!loading && !error && lista.length === 0 && (
          <p className="text-center text-muted py-10 text-[14px] leading-relaxed">
            No tienes listas de herramienta asignadas. Aparecerán aquí cuando tu supervisor programe un servicio con herramienta o material.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {lista.map((c) => {
            const est = estadoDelDia(c);
            return (
              <button
                key={c.grupoId}
                onClick={() => setAbierto(c)}
                className="w-full text-left rounded-2xl bg-surface border border-line p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2.5 mb-1.5">
                  <strong className="font-display font-bold text-[16px] leading-snug min-w-0">{c.proyecto}</strong>
                  <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${est.cls}`}>
                    <est.Icono size={12} strokeWidth={2.6} />
                    {est.label}
                  </span>
                </div>

                <p className="text-[13px] text-muted">
                  {c.diasTotales > 1 ? `Día ${c.numeroDia} de ${c.diasTotales} · ` : ''}
                  {fmtFecha(c.fecha)}
                </p>

                <div className="flex items-center gap-4 mt-2.5">
                  <span className="text-[13px] text-ink/80 flex items-center gap-1.5">
                    <Wrench size={14} strokeWidth={2.3} className="text-muted" />
                    {c.herramienta}
                  </span>
                  <span className="text-[13px] text-ink/80 flex items-center gap-1.5">
                    <Package size={14} strokeWidth={2.3} className="text-muted" />
                    {c.material}
                  </span>
                  <span className="text-[13px] text-ink/80 flex items-center gap-1.5">
                    <HardHat size={14} strokeWidth={2.3} className="text-muted" />
                    {c.equipo}
                  </span>
                  <ChevronRight size={16} strokeWidth={2.4} className="text-muted ml-auto" />
                </div>

                {c.solicitudesPendientes > 0 && (
                  <p className="text-[12.5px] text-amber font-medium mt-2 flex items-center gap-1.5">
                    <PackagePlus size={13} strokeWidth={2.5} />
                    {c.solicitudesPendientes === 1
                      ? 'Tienes 1 solicitud esperando autorización'
                      : `Tienes ${c.solicitudesPendientes} solicitudes esperando autorización`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {abierto && (
        <ModalOverlay onClose={() => { setAbierto(null); cargar(); }}>
          <div className="glass-strong rounded-3xl max-w-2xl w-full flex flex-col max-h-[92vh] sm:max-h-[85vh]">
            <div className="px-5 pt-5 pb-3 shrink-0 border-b border-line">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="font-display font-semibold text-[17px] min-w-0 truncate">{abierto.proyecto}</p>
                <button
                  onClick={() => { setAbierto(null); cargar(); }}
                  aria-label="Cerrar"
                  className="w-10 h-10 -mr-1.5 -mt-1 flex items-center justify-center active:scale-90 transition-transform shrink-0"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>
              <p className="text-[12.5px] text-muted">
                {abierto.diasTotales > 1 ? `Día ${abierto.numeroDia} de ${abierto.diasTotales} · ` : ''}
                {fmtFecha(abierto.fecha)}
              </p>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1">
              <InsumosChecklist
                grupoId={abierto.grupoId}
                servicioId={abierto.servicioId}
                proyecto={abierto.proyecto}
                puedeMarcar
              />
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
