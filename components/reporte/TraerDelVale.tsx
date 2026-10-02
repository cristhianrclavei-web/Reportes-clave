'use client';

import { useEffect, useState } from 'react';
import { PackageOpen, Check } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { salidasDelServicio } from '@/lib/vales';
import { FilaTuberia, FilaCable, FilaSoporteria, seccionDeArticulo, inferirTuberia } from '@/lib/materialesReporte';
import type { EquipoFila } from '@/components/EquipoInstaladoRenglon';

// «Traer lo que salió del almacén»: toma los vales entregados para este
// servicio (menos lo devuelto) y llena tubería, cable, soportería y equipo
// ya ligados a sus artículos. El técnico solo ajusta cantidades.

type Materiales = { tuberias: FilaTuberia[]; cables: FilaCable[]; soporteria: FilaSoporteria[]; equipos: EquipoFila[] };

function unidad(u: string, validas: string[], porDefecto: string): string {
  const x = (u || '').toLowerCase();
  const m = x.startsWith('m') && !x.startsWith('ma') ? 'm' : x.startsWith('pz') || x.startsWith('pie') ? 'pza' : x;
  return validas.includes(m) ? m : porDefecto;
}

export default function TraerDelVale({ servicioId, onTraer }: { servicioId: string; onTraer: (m: Materiales) => void }) {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof salidasDelServicio>> | null>(null);
  const [traido, setTraido] = useState(false);

  useEffect(() => {
    setTraido(false);
    salidasDelServicio(servicioId).then(setDatos).catch(() => setDatos(null));
  }, [servicioId]);

  if (!datos || datos.items.length === 0) return null;

  function traer() {
    const m: Materiales = { tuberias: [], cables: [], soporteria: [], equipos: [] };
    for (const { articulo: a, cantidad } of datos!.items) {
      const cant = String(Number(cantidad.toFixed(2)));
      const sec = seccionDeArticulo(a.descripcion, a.categoria);
      if (sec === 'equipo') m.equipos.push({ cant, desc: a.descripcion, marca: a.marca || '', modelo: a.modelo || '', serie: '', articuloId: a.id });
      else if (sec === 'tuberia') m.tuberias.push({ ...inferirTuberia(a.descripcion), cantidad: cant, unidad: unidad(a.unidad, ['m', 'tramo', 'pza'], 'pza'), articuloId: a.id, articulo: a.descripcion });
      else if (sec === 'cable') m.cables.push({ tipo: a.descripcion, calibre: '', cantidad: cant, unidad: unidad(a.unidad, ['m', 'bobina', 'rollo'], 'm'), articuloId: a.id, articulo: a.descripcion });
      else m.soporteria.push({ desc: a.descripcion, medida: '', cantidad: cant, unidad: unidad(a.unidad, ['pza', 'm', 'caja', 'bolsa', 'juego', 'tramo'], 'pza'), articuloId: a.id, articulo: a.descripcion });
    }
    onTraer(m);
    setTraido(true);
    showToast(`Se cargaron ${datos!.items.length} artículo(s). Ajusta las cantidades que no se usaron.`, 'success');
  }

  return (
    <div className="mb-3 rounded-2xl border border-teal/40 bg-teal/8 p-3.5 flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-teal/15 text-teal flex items-center justify-center shrink-0"><PackageOpen size={19} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold">Salió del almacén para este servicio</p>
        <p className="text-[12px] text-muted truncate">{datos.items.length} artículo(s) · vale {datos.folios.join(', ')}</p>
      </div>
      <button type="button" onClick={traer} disabled={traido}
        className="shrink-0 h-10 px-3.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-60">
        {traido ? <><Check size={15} /> Cargado</> : 'Cargar'}
      </button>
    </div>
  );
}
