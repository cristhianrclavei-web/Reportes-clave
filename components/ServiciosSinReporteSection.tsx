'use client';

import { useEffect, useState } from 'react';
import { showToast } from '@/components/Toast';
import {
  listarServiciosSinReporte, buscarReportesParaVincular, vincularReporteAServicio,
  ServicioSinReporte, ReporteParaVincular,
} from '@/lib/serviciosProgramados';
import { FileWarning, Search, Link2 } from 'lucide-react';

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

// Lo mismo que revisa el recordatorio push de las 6pm/8:30am (ver
// /api/cron/recordatorio-reporte), pero visible para el supervisor y
// comprobable: si el reporte sí se hizo pero el técnico no lo ligó al
// servicio al capturarlo (el selector de servicio en /nuevo es opcional),
// aquí se busca entre sus reportes sueltos y se vincula a mano — en vez de
// quedarse solo con la palabra de que "ya se hizo".
export default function ServiciosSinReporteSection() {
  const [servicios, setServicios] = useState<ServicioSinReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<ReporteParaVincular[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [vinculando, setVinculando] = useState<string | null>(null);

  async function cargar() {
    try {
      setServicios(await listarServiciosSinReporte());
    } catch {
      /* si falla, la sección simplemente no aparece */
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function toggleBuscar(s: ServicioSinReporte) {
    if (expandido === s.id) {
      setExpandido(null);
      return;
    }
    setExpandido(s.id);
    setCandidatos([]);
    setBuscando(true);
    try {
      setCandidatos(await buscarReportesParaVincular(s.id));
    } catch (e: any) {
      showToast(e?.message || 'No se pudieron buscar reportes', 'error');
    } finally {
      setBuscando(false);
    }
  }

  async function vincular(servicioId: string, reporte: ReporteParaVincular) {
    setVinculando(reporte.id);
    try {
      await vincularReporteAServicio(servicioId, reporte.id);
      setServicios((prev) => prev.filter((s) => s.id !== servicioId));
      setExpandido(null);
      showToast(`Vinculado al reporte de «${reporte.empresa_cliente}»`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo vincular', 'error');
    } finally {
      setVinculando(null);
    }
  }

  if (cargando || servicios.length === 0) return null;

  return (
    <div className="rounded-2xl bg-red/10 border border-red/25 p-4 mb-5">
      <p className="text-[13.5px] font-semibold text-red flex items-center gap-2 mb-1">
        <FileWarning size={16} strokeWidth={2.5} className="shrink-0" />
        {servicios.length === 1
          ? '1 servicio trabajado sin reporte'
          : `${servicios.length} servicios trabajados sin reporte`}
      </p>
      <p className="text-[12.5px] text-ink/70 mb-4">
        Si el técnico ya lo hizo pero no lo ligó al programarlo, búscalo aquí y vincúlalo.
      </p>

      <div className="space-y-3">
        {servicios.map((s) => {
          const abierto = expandido === s.id;
          return (
            <div key={s.id} className="rounded-xl bg-surface border border-line p-3.5">
              <div className="flex justify-between items-baseline gap-2 mb-1">
                <span className="font-display font-semibold text-[15px] tracking-wide truncate">{s.proyecto}</span>
                <span className="text-[12.5px] text-muted shrink-0">{formatFecha(s.fecha)}</span>
              </div>
              <p className="text-[12.5px] text-muted">
                {s.dias_totales > 1 ? `Día ${s.numero_dia} de ${s.dias_totales} · ` : ''}
                {s.tecnicos.map((t) => t.nombre).join(', ') || 'Sin técnico asignado'}
              </p>

              <button
                onClick={() => toggleBuscar(s)}
                className="w-full min-h-[42px] mt-3 rounded-xl bg-surface-2 border border-line text-[13.5px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                <Search size={14} strokeWidth={2.4} />
                {abierto ? 'Ocultar búsqueda' : 'Buscar reporte para vincular'}
              </button>

              {abierto && (
                <div className="mt-3 pt-3 border-t border-line">
                  {buscando && <p className="text-[12.5px] text-muted text-center py-3">Buscando…</p>}
                  {!buscando && candidatos.length === 0 && (
                    <p className="text-[12.5px] text-muted text-center py-3 leading-relaxed">
                      No hay reportes sueltos de sus técnicos cerca de esa fecha.
                    </p>
                  )}
                  <div className="space-y-2">
                    {candidatos.map((r) => (
                      <div key={r.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-2 border border-line">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold truncate">{r.empresa_cliente}</p>
                          <p className="text-[11.5px] text-muted truncate">{r.tecnico} · {formatFecha(r.fecha)} · {r.claveFormato}</p>
                        </div>
                        <button
                          onClick={() => vincular(s.id, r)}
                          disabled={vinculando === r.id}
                          className="shrink-0 min-h-[36px] px-3 rounded-lg bg-teal text-inkOnAccent text-[12.5px] font-semibold flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-60"
                        >
                          <Link2 size={13} strokeWidth={2.6} />
                          {vinculando === r.id ? '...' : 'Vincular'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
