'use client';

import { useEffect, useState } from 'react';
import { Receipt, ChevronDown } from 'lucide-react';
import { LineaCosto, costoAlmacenServicio, pesos } from '@/lib/almacen';

// Lo que salió del almacén para este servicio (o su proyecto completo):
// material y equipo con su costo; la herramienta aparte, porque regresa.

export default function CostoAlmacenServicio({ servicioId, esProyecto }: { servicioId: string; esProyecto: boolean }) {
  const [lineas, setLineas] = useState<LineaCosto[] | null>(null);
  const [ver, setVer] = useState(false);

  useEffect(() => {
    costoAlmacenServicio(servicioId).then(setLineas).catch(() => setLineas(null));
  }, [servicioId]);

  if (!lineas || lineas.length === 0) return null;
  const consumo = lineas.filter((l) => l.categoria !== 'herramienta' && l.neto > 0);
  const herramienta = lineas.filter((l) => l.categoria === 'herramienta');
  const total = consumo.reduce((s, l) => s + (l.total || 0), 0);
  const sinCosto = consumo.filter((l) => l.costo_unitario == null).length;
  const herrFuera = herramienta.reduce((s, l) => s + l.neto, 0);

  return (
    <div className="glass rounded-2xl p-4 mb-4">
      <button type="button" onClick={() => setVer((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="font-display font-semibold text-[15px] flex items-center gap-2"><Receipt size={17} className="text-teal" /> Costo de almacén{esProyecto ? ' del proyecto' : ''}</span>
          <span className="block text-[12.5px] text-muted mt-0.5">
            Material y equipo: <b className="text-ink">{pesos(total)}</b>
            {sinCosto > 0 && <span className="text-amber"> · {sinCosto} sin costo capturado</span>}
            {herrFuera > 0 && ` · ${herrFuera} herramienta(s) fuera`}
          </span>
        </span>
        <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${ver ? 'rotate-180' : ''}`} />
      </button>
      {ver && (
        <div className="mt-3 text-[12.5px]">
          {consumo.map((l) => (
            <div key={l.articulo_id} className="flex justify-between gap-2 py-1 border-t border-line">
              <span className="min-w-0 truncate">{l.neto} {l.unidad} · {l.descripcion}</span>
              <span className={`shrink-0 ${l.total == null ? 'text-amber' : ''}`}>{l.total == null ? 'sin costo' : pesos(l.total)}</span>
            </div>
          ))}
          {herramienta.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wider text-muted mt-3 mb-1">Herramienta (regresa, no suma al costo)</p>
              {herramienta.map((l) => (
                <div key={l.articulo_id} className="flex justify-between gap-2 py-1 border-t border-line">
                  <span className="min-w-0 truncate">{l.descripcion}</span>
                  <span className={`shrink-0 ${l.neto > 0 ? 'text-amber' : 'text-muted'}`}>{l.neto > 0 ? `${l.neto} fuera` : 'regresó'}</span>
                </div>
              ))}
            </>
          )}
          <p className="text-[11.5px] text-muted mt-2">Salidas menos devoluciones de los vales de este {esProyecto ? 'proyecto' : 'servicio'}, con el costo de la última compra registrada.</p>
        </div>
      )}
    </div>
  );
}
