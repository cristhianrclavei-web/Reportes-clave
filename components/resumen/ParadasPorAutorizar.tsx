'use client';

import { useEffect, useState } from 'react';
import { ReceiptText, ThumbsDown, ThumbsUp } from 'lucide-react';
import AvisoPlegable from '@/components/AvisoPlegable';
import TicketsDeGasto from '@/components/gastos/TicketsDeGasto';
import { showToast } from '@/components/Toast';
import { horaActualMexico } from '@/lib/horaMexico';
import { fechaCorta, inicioVentana } from '@/lib/coberturaReportes';
import { enlaceMapa, infoMotivoParada, textoHorarioParada, textoMonto, textoTrasFirma, type Parada } from '@/lib/paradas';
import { cargarParadas, revisarParada } from '@/lib/paradasDatos';
import { faltaElParche } from '@/lib/visitasExigiblesDatos';

// Aviso del Resumen: paradas del rastreo justificadas que esperan
// autorización (combustible y compras con su ticket, con un cliente, otro).
// Lo autorizado pasa a la bitácora del técnico. Comida y tráfico/espera no
// llegan aquí: no necesitan autorización.
export default function ParadasPorAutorizar() {
  const [porAutorizar, setPorAutorizar] = useState<Parada[]>([]);
  const [sinJustificar, setSinJustificar] = useState(0);
  // Rato con el cliente después de la firma que el técnico no ha justificado en 24 h.
  const [atrasadas, setAtrasadas] = useState<Parada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const { fecha: hoy } = horaActualMexico();
    cargarParadas(inicioVentana(hoy), hoy)
      .then((lista) => {
        if (cancelado) return;
        setPorAutorizar(lista.filter((p) => p.estado === 'pendiente'));
        setSinJustificar(lista.filter((p) => p.estado === null && p.fecha < hoy).length);
        const hace24h = Date.now() - 24 * 3600000;
        setAtrasadas(lista.filter((p) => p.reporte_id && p.estado === null && new Date(p.fin).getTime() < hace24h));
      })
      .catch((e: any) => { if (!cancelado && !faltaElParche(e)) setError(e.message); });
    return () => { cancelado = true; };
  }, []);

  async function revisar(parada: Parada, aprobar: boolean) {
    setRevisando(parada.id);
    try {
      await revisarParada(parada.id, aprobar);
      setPorAutorizar((prev) => prev.filter((p) => p.id !== parada.id));
      showToast(aprobar ? 'Autorizada: quedó en la bitácora del técnico.' : 'Rechazada: el técnico la tendrá que justificar otra vez.', aprobar ? 'success' : undefined);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar. Intenta de nuevo.', 'error');
    } finally {
      setRevisando(null);
    }
  }

  if (error) {
    return (
      <p className="mb-2.5 px-4 py-3 rounded-2xl bg-red/10 border border-red/30 text-[13px] text-ink/85">
        <b className="text-red">No se pudieron revisar las paradas del rastreo.</b> {error}
      </p>
    );
  }
  if (porAutorizar.length === 0 && atrasadas.length === 0) return null;

  const totalGastos = porAutorizar.reduce((n, p) => n + (p.monto || 0), 0);
  const partes = [`${porAutorizar.length} por autorizar`];
  if (totalGastos > 0) partes.push(`${textoMonto(totalGastos)} en gastos`);
  if (sinJustificar > 0) partes.push(`${sinJustificar} sin justificar`);
  if (atrasadas.length > 0) partes.push(`${atrasadas.length} después de la firma sin justificar (+24 h)`);

  return (
    <AvisoPlegable
      tono="amber"
      Icono={ReceiptText}
      cuenta={porAutorizar.length + atrasadas.length}
      titulo={porAutorizar.length === 0 ? 'Paradas sin justificar' : porAutorizar.length === 1 ? 'Parada o gasto por autorizar' : 'Paradas y gastos por autorizar'}
      resumen={partes.join(' · ')}
    >
      {atrasadas.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber/40 bg-amber/10 p-3 text-[13px]">
          <p className="font-semibold text-amber mb-1">Después de la firma, sin justificar en más de 24 h</p>
          <ul className="flex flex-col gap-1">
            {atrasadas.map((p) => (
              <li key={p.id}>
                <b>{p.tecnico || 'Personal técnico'}</b> · {p.cliente || 'cliente'} · {fechaCorta(p.fecha)} · {textoHorarioParada(p)}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted mt-1">En su bitácora sale como sin registrar hasta que diga qué fue.</p>
        </div>
      )}
      <ul className="flex flex-col gap-2.5 mb-2">
        {porAutorizar.map((p) => {
          const info = infoMotivoParada(p.motivo);
          return (
            <li key={p.id} className="rounded-xl bg-surface-2/40 border border-line p-3 text-[13px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{p.tecnico || 'Personal técnico'}</p>
                  <p className="text-muted">{fechaCorta(p.fecha)} · {textoHorarioParada(p)}</p>
                  {textoTrasFirma(p) && <p className="text-muted">{textoTrasFirma(p)}</p>}
                </div>
                <a href={enlaceMapa(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="shrink-0 text-teal font-semibold text-[12.5px]">
                  Ver lugar
                </a>
              </div>
              <p className="mt-1.5">
                <b>{info?.label || 'Parada'}</b>{p.detalle ? ` · «${p.detalle}»` : ''}
              </p>
              {p.monto !== null && (
                <TicketsDeGasto monto={p.monto} fotos={p.fotos || []} sinTicket={!!p.sin_ticket} motivoSinTicket={p.motivo_sin_ticket} />
              )}
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => revisar(p, false)} disabled={revisando === p.id}
                  className="min-h-[42px] rounded-xl border border-red/40 text-red text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
                  <ThumbsDown size={15} /> Rechazar
                </button>
                <button type="button" onClick={() => revisar(p, true)} disabled={revisando === p.id}
                  className="min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
                  <ThumbsUp size={15} /> Autorizar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </AvisoPlegable>
  );
}
