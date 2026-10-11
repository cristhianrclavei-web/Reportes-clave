'use client';

import { useEffect, useState } from 'react';
import { Search, Users, Info, ChevronDown } from 'lucide-react';
import { ReporteParticipe, listarReportesDondeParticipe } from '@/lib/reportesParticipe';
import EstadoVacio from '@/components/EstadoVacio';

function fechaCorta(fecha: string): string {
  const [y, m, d] = (fecha || '').slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : 'Sin fecha';
}

// Reportes que capturó un compañero y en los que el técnico también estuvo.
// Solo consulta: fecha, horas y actividades, para dar seguimiento al volver
// al mismo sitio.
export default function ReportesDondeParticipe() {
  const [reportes, setReportes] = useState<ReporteParticipe[] | null>(null);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  // Reporte con «Ver detalles» desplegado (uno a la vez).
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    listarReportesDondeParticipe().then(setReportes).catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-red/10 border border-red/30">
        <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los reportes</p>
        <p className="text-[13px] text-ink/80 leading-relaxed">Revisa tu conexión y vuelve a entrar a esta pestaña.</p>
      </div>
    );
  }
  if (reportes === null) return <p className="text-[13.5px] text-muted">Cargando…</p>;
  if (reportes.length === 0) {
    return <EstadoVacio icono={<Users size={24} strokeWidth={2} />} titulo="Sin reportes de compañeros" detalle="Aquí verás los reportes que hizo otro técnico y en los que tú también trabajaste." />;
  }

  const texto = busqueda.trim().toLowerCase();
  const visibles = texto
    ? reportes.filter((r) => r.empresa_cliente.toLowerCase().includes(texto) || (r.folio || '').toLowerCase().includes(texto))
    : reportes;

  return (
    <div>
      <div className="flex items-start gap-2.5 mb-4 p-3 rounded-xl bg-teal/8 border border-teal/25">
        <Info size={16} strokeWidth={2.4} className="text-teal shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-ink/80 leading-relaxed">
          <b className="text-ink">Reportes de tus compañeros donde también trabajaste.</b> Sirven para recordar qué se hizo en un sitio; solo ves fecha, horario y actividades.
        </p>
      </div>
      <div className="relative lg:w-[340px] mb-4">
        <Search size={16} strokeWidth={2.3} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input
          placeholder="Buscar por cliente o folio"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-10 pr-3.5 min-h-[44px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[14px] placeholder:text-faint"
        />
      </div>
      {visibles.length === 0 && <p className="text-[13.5px] text-muted">Ningún reporte coincide con la búsqueda.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 items-start">
        {visibles.map((r) => (
          <article key={r.id} className="rounded-2xl bg-surface border border-line px-4 py-3.5">
            <div className="flex justify-between items-baseline gap-2.5">
              <strong className="font-display font-bold text-[15.5px] tracking-wide truncate">{r.empresa_cliente}</strong>
              <span className="text-[12px] text-muted shrink-0">{fechaCorta(r.fecha)}</span>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <p className="text-[12.5px] text-muted min-w-0 truncate">
                {r.hora_llegada ? `${r.hora_llegada}${r.hora_salida ? ` a ${r.hora_salida}` : ''} hrs` : 'Sin horario'}
                {r.folio && <> · <span className="font-mono">{r.folio}</span></>}
              </p>
              <button type="button" onClick={() => setAbierto(abierto === r.id ? null : r.id)} aria-expanded={abierto === r.id} className="shrink-0 -mr-1.5 -mb-1.5 px-1.5 py-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-teal">
                {abierto === r.id ? 'Ocultar' : 'Ver detalles'}
                <ChevronDown size={15} strokeWidth={2.6} className={`transition-transform ${abierto === r.id ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {abierto === r.id && (
              <div className="mt-3 pt-3 border-t border-line">
                {r.autor && <p className="text-[12.5px] text-muted mb-2">Reporte hecho por <b className="text-ink">{r.autor}</b></p>}
                {r.actividades.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-[13.5px] text-ink/85 list-disc pl-4 marker:text-teal">
                    {r.actividades.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">Sin actividades registradas.</p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
