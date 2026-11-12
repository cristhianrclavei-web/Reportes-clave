'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Network, Paperclip, RefreshCw, X } from 'lucide-react';
import { anexosGuiaDeReporte, resumenCortoGuia, resumirGuia, type AnexoGuia } from '@/lib/anexoGuia';
import { nombreSistema, type Guia } from '@/lib/guias';
import { guiasDelCliente } from '@/lib/guiasDatos';

// En el reporte: anexar la guía de conexión del cliente (lo conectado y las
// pruebas). Solo ofrece las guías de los SISTEMAS marcados en el reporte: en
// un servicio de paneles solares salen las de paneles solares, no las de
// control de acceso. Lo ya anexado se sigue viendo aunque cambien el sistema.

export { anexosGuiaDeReporte };

export default function AnexarGuia({ clienteId, sistemas, visible, anexos, onCambiar }: {
  clienteId: string | null;
  // Los sistemas marcados en el reporte.
  sistemas: string[];
  visible: boolean;
  anexos: AnexoGuia[];
  onCambiar: (anexos: AnexoGuia[]) => void;
}) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setError(null);
    try {
      setGuias(await guiasDelCliente(clienteId));
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las guías de conexión.');
    }
  }, [clienteId]);

  useEffect(() => {
    if (visible && clienteId) cargar();
  }, [visible, clienteId, cargar]);

  const anexadas = new Set(anexos.map((a) => a.guia_id));
  const disponibles = guias.filter((g) => sistemas.includes(g.sistema) && !anexadas.has(g.id));

  // Sin guías de estos sistemas y sin nada anexado: la sección no estorba.
  if (disponibles.length === 0 && anexos.length === 0 && !error) return null;

  function anexar(guia: Guia) {
    onCambiar([...anexos, resumirGuia(guia, new Date().toISOString())]);
  }

  // Vuelve a tomar la copia: por si siguieron conectando después de anexarla.
  function actualizar(anexo: AnexoGuia) {
    const guia = guias.find((g) => g.id === anexo.guia_id);
    if (!guia) return;
    onCambiar(anexos.map((a) => (a.guia_id === anexo.guia_id ? resumirGuia(guia, new Date().toISOString()) : a)));
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-2 font-display font-semibold text-[15px] mb-1"><Network size={17} strokeWidth={2.3} className="text-teal" /> Guía de conexión</p>
      <p className="text-[12.5px] text-muted mb-3">Lo que se conectó y lo que dieron las pruebas sale como anexo en el PDF del reporte.</p>

      {anexos.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {anexos.map((a) => {
            const fuera = a.pruebas.some((p) => p.estado === 'fuera');
            return (
              <li key={a.guia_id} className="rounded-xl border border-teal/40 bg-teal/5 p-3 flex items-start gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold truncate">{a.nombre}</span>
                  <span className="block text-[12.5px] text-muted">{nombreSistema(a.sistema)} · {resumenCortoGuia(a)}</span>
                  {fuera && <span className="flex items-center gap-1 text-[12.5px] font-semibold text-red mt-0.5"><AlertTriangle size={14} strokeWidth={2.5} /> Hay pruebas fuera de rango</span>}
                </span>
                {guias.some((g) => g.id === a.guia_id) && (
                  <button type="button" onClick={() => actualizar(a)} aria-label={`Actualizar la copia de ${a.nombre}`} title="Volver a tomar el avance" className="w-10 h-10 rounded-xl flex items-center justify-center text-muted"><RefreshCw size={16} /></button>
                )}
                <button type="button" onClick={() => onCambiar(anexos.filter((x) => x.guia_id !== a.guia_id))} aria-label={`Quitar ${a.nombre} del reporte`} className="w-10 h-10 rounded-xl flex items-center justify-center text-muted"><X size={18} /></button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        {disponibles.map((g) => (
          <button key={g.id} type="button" onClick={() => anexar(g)}
            className="w-full min-h-[48px] rounded-xl border border-dashed border-line-strong bg-surface-2 px-3 text-left text-[14px] font-semibold flex items-center gap-2">
            <Paperclip size={17} strokeWidth={2.2} className="shrink-0" /> <span className="truncate">Anexar «{g.nombre}»</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-red font-semibold text-[13px] mt-2">{error} <button type="button" onClick={cargar} className="underline">Reintentar</button></p>
      )}
    </div>
  );
}
