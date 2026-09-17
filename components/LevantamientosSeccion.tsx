'use client';

import { useEffect, useMemo, useState } from 'react';
import { Levantamiento, listarLevantamientos } from '@/lib/levantamientos';
import LevantamientoForm from './LevantamientoForm';
import LevantamientoDetalleModal from './LevantamientoDetalleModal';
import SelectorSemana, { RangoSeleccionado } from '@/components/SelectorSemana';
import { Plus, Search, X } from 'lucide-react';

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}
function nombreCreador(profiles: Levantamiento['profiles']): string {
  if (!profiles) return '—';
  return Array.isArray(profiles) ? profiles[0]?.full_name || '—' : profiles.full_name || '—';
}

// Sección embebida en Reportes (técnico y supervisor). `soloPropios` decide
// el alcance de la consulta: el técnico solo ve lo suyo, el supervisor ve
// de todos — la misma pantalla sirve para los dos, ver
// lib/levantamientos.ts#listarLevantamientos.
export default function LevantamientosSeccion({ soloPropios }: { soloPropios: boolean }) {
  const [seccion, setSeccion] = useState<'nuevo' | 'lista'>('lista');
  const [levantamientos, setLevantamientos] = useState<Levantamiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [rango, setRango] = useState<RangoSeleccionado | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const fechasDeLevantamientos = useMemo(() => levantamientos.map((l) => l.fecha).filter(Boolean), [levantamientos]);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setLevantamientos(await listarLevantamientos(soloPropios));
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los levantamientos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [soloPropios]);

  const filtrados = useMemo(() => {
    return levantamientos.filter((l) => {
      // El rango de fechas no aplica cuando se busca por texto: quien escribe
      // el nombre de un cliente quiere encontrarlo esté en la semana que esté.
      if (!search && rango && l.fecha) {
        if (l.fecha < rango.desde || l.fecha > rango.hasta) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const hay = `${l.empresa} ${l.folio} ${l.atencion || ''} ${nombreCreador(l.profiles)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [levantamientos, search, rango]);

  if (seccion === 'nuevo') {
    return (
      <div>
        <button
          onClick={() => setSeccion('lista')}
          className="flex items-center gap-1.5 mb-4 text-[13.5px] text-ink/70 font-medium active:scale-95 transition-transform"
        >
          <X size={16} strokeWidth={2.4} />
          Cancelar
        </button>
        <LevantamientoForm
          modo="crear"
          onCancelar={() => setSeccion('lista')}
          onGuardado={async () => {
            setSeccion('lista');
            await cargar();
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setSeccion('nuevo')}
        className="w-full min-h-[54px] mb-5 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-glow-teal"
      >
        <Plus size={19} strokeWidth={2.6} />
        Nuevo levantamiento
      </button>

      {error && (
        <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
          <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los levantamientos</p>
          <p className="text-[13px] text-ink/80 leading-relaxed">{error}</p>
        </div>
      )}

      <SelectorSemana fechas={fechasDeLevantamientos} onCambio={setRango} etiqueta="levantamientos" />

      <div className="relative mb-4">
        <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={soloPropios ? 'Buscar por cliente o folio...' : 'Buscar por cliente, folio o quién lo hizo...'}
          className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
        />
      </div>

      {cargando && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="rounded-2xl bg-surface-2 h-[92px] animate-pulse" />)}
        </div>
      )}

      {!cargando && filtrados.length === 0 && (
        <p className="text-center text-muted py-14 text-[14px] leading-relaxed">
          {levantamientos.length === 0
            ? 'Todavía no hay levantamientos.'
            : search
            ? 'Sin resultados para esa búsqueda.'
            : 'No hay levantamientos en estas fechas. Cambia de semana o toca «Toda la semana».'}
        </p>
      )}

      {!cargando && filtrados.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map((l) => (
            <button
              key={l.id}
              onClick={() => setAbierto(l.id)}
              className="text-left rounded-2xl border-l-4 border-teal bg-surface p-4 sm:p-5 active:scale-[0.99] hover:shadow-glow transition-all shadow-glow"
            >
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Cliente / Empresa</div>
                  <strong className="font-display font-bold text-[16px] tracking-wide block truncate">{l.empresa}</strong>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Folio</div>
                  <span className="text-[12px] font-mono font-semibold text-teal">{l.folio}</span>
                </div>
              </div>
              {!soloPropios && (
                <p className="text-[12px] text-muted mb-2 truncate">{nombreCreador(l.profiles)}</p>
              )}
              <div className="text-[13px] font-medium">{formatFecha(l.fecha)}</div>
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <LevantamientoDetalleModal
          levantamientoId={abierto}
          puedeEditar
          onClose={() => setAbierto(null)}
          onEliminado={() => cargar()}
          onActualizado={() => cargar()}
        />
      )}
    </div>
  );
}
